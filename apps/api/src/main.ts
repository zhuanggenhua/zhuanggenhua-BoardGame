import 'dotenv/config';
import 'reflect-metadata';
import { existsSync } from 'fs';
import { join } from 'path';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import mongoose from 'mongoose';
import { AppModule } from './app.module';
import { MsgpackIoAdapter } from './adapters/msgpack-io.adapter';
import { createAdminTestLatencyMiddleware } from './modules/admin/admin-test-latency.middleware';
import { AdminTestLatencyService } from './modules/admin/admin-test-latency.service';
import { GlobalHttpExceptionFilter } from './shared/filters/http-exception.filter';
import logger from '../../../server/logger';
import { isNoCacheSpaEntryPath, shouldProxyGameServerRequest, shouldServeSpaFallback } from './spa-fallback';
import {
    LONG_CACHE_IMMUTABLE_HEADER,
    LONG_CACHE_MAX_AGE,
    NO_CACHE_HEADER,
    getPublicAssetCacheControl,
    isNoCacheStaticFilePath,
} from './spa-fallback';

type TestMongoServerHandle = {
    stop(): Promise<void>;
    getUri(): string;
};

const LOCAL_TEST_MONGO_URI = 'mongodb://127.0.0.1:27017';
const TEST_MONGO_PROBE_TIMEOUT_MS = 1500;
const TEST_MONGO_START_RETRIES = 3;

let testMongoServer: TestMongoServerHandle | null = null;

type MongoBootstrapMode = 'none' | 'test' | 'dev-memory';

const resolveMongoBootstrapMode = (): MongoBootstrapMode => {
    if (process.env.NODE_ENV === 'test') {
        return 'test';
    }

    if (process.env.NODE_ENV === 'development' && process.env.BG_API_USE_MEMORY_MONGO === '1') {
        return 'dev-memory';
    }

    return 'none';
};

const configureMongoMemoryServerEnv = () => {
    process.env.MONGOMS_PREFER_GLOBAL_PATH ??= 'true';
    process.env.MONGOMS_DOWNLOAD_DIR ??= path.join(os.homedir(), '.cache', 'mongodb-binaries');
    process.env.MONGOMS_EXP_NET0LISTEN ??= 'false';

    if (process.env.TEST_MONGOD_PATH && !process.env.MONGOMS_SYSTEM_BINARY) {
        process.env.MONGOMS_SYSTEM_BINARY = process.env.TEST_MONGOD_PATH;
    }
};

const delay = async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
};

const createLoopbackMongoMemoryServer = async (): Promise<TestMongoServerHandle> => {
    configureMongoMemoryServerEnv();
    const { MongoMemoryServer } = await import('mongodb-memory-server');

    let lastError: unknown;
    for (let attempt = 1; attempt <= TEST_MONGO_START_RETRIES; attempt += 1) {
        try {
            return await MongoMemoryServer.create({
                instance: {
                    ip: '127.0.0.1',
                    port: 0,
                },
            });
        } catch (error) {
            lastError = error;
            const code = error instanceof Error && 'code' in error ? String(error.code) : '';
            const isRetryable = code === 'EACCES' || code === 'EADDRINUSE' || code === 'EBUSY' || code === 'ETXTBSY';
            if (!isRetryable || attempt === TEST_MONGO_START_RETRIES) {
                throw error;
            }
            await delay(attempt * 1000);
        }
    }

    throw lastError instanceof Error ? lastError : new Error('创建 MongoMemoryServer 失败');
};

const resolvePreferredTestMongoUri = async (): Promise<{ mongo: TestMongoServerHandle | null; mongoUri: string }> => {
    const externalMongoUri = process.env.MONGO_URI?.trim();
    if (externalMongoUri) {
        return { mongo: null, mongoUri: externalMongoUri };
    }

    const probeConnection = mongoose.createConnection(LOCAL_TEST_MONGO_URI, {
        dbName: 'admin',
        serverSelectionTimeoutMS: TEST_MONGO_PROBE_TIMEOUT_MS,
    });

    try {
        await probeConnection.asPromise();
        await probeConnection.close();
        return { mongo: null, mongoUri: LOCAL_TEST_MONGO_URI };
    } catch {
        try {
            await probeConnection.close();
        } catch {
            // ignore probe cleanup failure
        }
    }

    const mongo = await createLoopbackMongoMemoryServer();
    return { mongo, mongoUri: mongo.getUri() };
};

const prepareMongoIfNeeded = async () => {
    const bootstrapMode = resolveMongoBootstrapMode();
    if (bootstrapMode === 'none' || process.env.MONGO_URI?.trim()) {
        return;
    }

    const { mongo, mongoUri } = bootstrapMode === 'test'
        ? await resolvePreferredTestMongoUri()
        : await (async () => {
            const memoryMongo = await createLoopbackMongoMemoryServer();
            return { mongo: memoryMongo, mongoUri: memoryMongo.getUri() };
        })();
    process.env.MONGO_URI = mongoUri;
    testMongoServer = mongo;

    logger.info('[API] 启动期 Mongo 已就绪', {
        bootstrap_mode: bootstrapMode,
        source: mongo ? 'memory-server' : 'external-or-local',
        mongo_uri: mongo ? 'mongodb-memory-server' : mongoUri,
    });
};

const stopTestMongoIfNeeded = async () => {
    if (!testMongoServer) {
        return;
    }

    const server = testMongoServer;
    testMongoServer = null;
    await server.stop();
};

const initSentryInBackground = async () => {
    const dsn = process.env.SENTRY_DSN?.trim();
    if (!dsn) {
        return;
    }

    const startedAt = Date.now();
    try {
        const Sentry = await import('@sentry/nestjs');
        Sentry.init({
            dsn,
            tracesSampleRate: 1.0,
        });
        logger.info('[API] Sentry 初始化完成', {
            duration_ms: Date.now() - startedAt,
        });
    } catch (error) {
        logger.error('[API] Sentry 初始化失败:', error);
    }
};

async function bootstrap() {
    const bootstrapStartedAt = Date.now();
    await prepareMongoIfNeeded();

    const webOrigins = process.env.WEB_ORIGINS
        ? process.env.WEB_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const appWebOrigins = process.env.APP_WEB_ORIGINS
        ? process.env.APP_WEB_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
        : ['http://localhost', 'https://localhost', 'capacitor://localhost'];
    const allowedOrigins = new Set([...webOrigins, ...appWebOrigins]);
    const isDev = !process.env.WEB_ORIGINS;
    const isAllowedRequestOrigin = (origin?: string) => {
        if (!origin) return true;
        if (isDev && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            return true;
        }
        return allowedOrigins.has(origin);
    };

    const app = await NestFactory.create(AppModule, {
        cors: {
            origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
                if (isAllowedRequestOrigin(origin)) {
                    return callback(null, true);
                }
                callback(new Error(`CORS: origin ${origin} not allowed`));
            },
            credentials: true,
        },
        rawBody: false,
    });

    app.useWebSocketAdapter(new MsgpackIoAdapter(app));

    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use(express.json({ limit: '2mb' }));
    expressApp.use(express.urlencoded({ extended: true, limit: '2mb' }));
    expressApp.use('/admin-api', createAdminTestLatencyMiddleware(app.get(AdminTestLatencyService)));

    const gameServerTarget =
        process.env.GAME_SERVER_PROXY_TARGET
        || process.env.GAME_SERVER_URL
        || 'http://127.0.0.1:18000';

    expressApp.use((req, res, next) => {
        const requestOrigin = req.headers.origin;
        if (isAllowedRequestOrigin(requestOrigin)) {
            if (requestOrigin) {
                res.setHeader('Access-Control-Allow-Origin', requestOrigin);
                res.setHeader('Vary', 'Origin');
            }
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader(
            'Access-Control-Allow-Headers',
            req.headers['access-control-request-headers'] || 'Content-Type, Authorization',
        );

        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }

        next();
    });

    const gameProxy = createProxyMiddleware({
        target: gameServerTarget,
        changeOrigin: true,
        ws: true,
        pathFilter: shouldProxyGameServerRequest,
        on: {
            proxyReq: fixRequestBody,
        },
    });

    expressApp.use(gameProxy);

    const distPath = join(process.cwd(), 'dist');
    const uploadsPath = join(process.cwd(), 'uploads');
    const publicAssetsPath = join(process.cwd(), 'public/assets');

    if (existsSync(uploadsPath)) {
        expressApp.use('/assets', express.static(uploadsPath));
    }
    if (existsSync(distPath)) {
        expressApp.use('/assets', express.static(join(distPath, 'assets'), {
            maxAge: LONG_CACHE_MAX_AGE,
            immutable: true,
        }));
        expressApp.use('/fonts', express.static(join(distPath, 'fonts'), {
            maxAge: LONG_CACHE_MAX_AGE,
            immutable: true,
            etag: true,
            lastModified: true,
        }));
        expressApp.use('/logos', express.static(join(distPath, 'logos'), {
            maxAge: LONG_CACHE_MAX_AGE,
            immutable: true,
            etag: true,
            lastModified: true,
        }));
        expressApp.use('/game-data', express.static(join(distPath, 'game-data'), {
            maxAge: LONG_CACHE_MAX_AGE,
            immutable: true,
            etag: true,
            lastModified: true,
            setHeaders: (res, filePath) => {
                if (isNoCacheStaticFilePath(filePath)) {
                    res.setHeader('Cache-Control', NO_CACHE_HEADER);
                }
            },
        }));
        expressApp.use(express.static(distPath, {
            etag: true,
            lastModified: true,
            setHeaders: (res, filePath) => {
                if (isNoCacheStaticFilePath(filePath)) {
                    res.setHeader('Cache-Control', NO_CACHE_HEADER);
                }
            },
        }));

        expressApp.get('*', (req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (isNoCacheSpaEntryPath(req.path)) {
                res.setHeader('Cache-Control', NO_CACHE_HEADER);
                return res.sendFile(join(distPath, 'index.html'));
            }
            if (!shouldServeSpaFallback(req.path)) return next();
            res.setHeader('Cache-Control', NO_CACHE_HEADER);
            return res.sendFile(join(distPath, 'index.html'));
        });
    }
    if (existsSync(publicAssetsPath)) {
        expressApp.use('/assets', express.static(publicAssetsPath, {
            maxAge: '7d',
            etag: true,
            lastModified: true,
            setHeaders: (res) => {
                const requestPath = res.req?.originalUrl || res.req?.url || '';
                const cacheControl = getPublicAssetCacheControl(requestPath);
                if (cacheControl === LONG_CACHE_IMMUTABLE_HEADER) {
                    res.setHeader('Cache-Control', cacheControl);
                }
            },
        }));
    }

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
        })
    );
    app.useGlobalFilters(new GlobalHttpExceptionFilter());

    const port = Number(process.env.API_SERVER_PORT) || 18001;
    const server = await app.listen(port);
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
        const url = req.url || '';
        if (url.startsWith('/lobby-socket') || url.startsWith('/socket.io')) {
            gameProxy.upgrade(req, socket, head);
        }
    });

    logger.info('[API] listening', {
        port,
        bootstrap_ms: Date.now() - bootstrapStartedAt,
    });

    void initSentryInBackground();

    const shutdown = async (signal: string) => {
        try {
            await app.close();
            await stopTestMongoIfNeeded();
        } catch (error) {
            logger.error(`[API] ${signal} 优雅关闭失败:`, error);
        } finally {
            process.exit(0);
        }
    };

    process.once('SIGTERM', () => {
        void shutdown('SIGTERM');
    });

    process.once('SIGINT', () => {
        void shutdown('SIGINT');
    });
}

bootstrap().catch((error) => {
    logger.error('[API] 启动失败:', error);
    process.exit(1);
});
