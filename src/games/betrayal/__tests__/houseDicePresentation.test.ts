import { describe, expect, it } from "vitest";

import {
  BETRAYAL_HOUSE_DICE_FACE_SYSTEM,
  createBetrayalHouseDiceSkin,
} from "../houseDicePresentation";

describe("Betrayal house dice presentation", () => {
  it("山屋骰子皮肤按真实 0/0/1/1/2/2 骰面分布渲染，避免重掷时只有贴图闪切", () => {
    const skin = createBetrayalHouseDiceSkin(2);

    expect(skin.id).toBe(
      `${BETRAYAL_HOUSE_DICE_FACE_SYSTEM}-physical-distribution`,
    );
    expect(skin.faceCanvases[1]).toBe(skin.faceCanvases[2]);
    expect(skin.faceCanvases[3]).toBe(skin.faceCanvases[4]);
    expect(skin.faceCanvases[5]).toBe(skin.faceCanvases[6]);
    expect(skin.faceCanvases[1]).not.toBe(skin.faceCanvases[3]);
    expect(skin.faceCanvases[3]).not.toBe(skin.faceCanvases[5]);
    expect(skin.topFaceCanvas).toBe(skin.faceCanvases[5]);
  });
});
