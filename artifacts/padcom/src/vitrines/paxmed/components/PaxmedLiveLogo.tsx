import { vitrineAsset } from "@paxmed/assets";
const wordmarkAsset = { url: vitrineAsset("paxmed_wordmark.png") };
import { PaxterSymbolGlass } from "./paxter-fx/PaxterSymbolGlass";
import { PaxterRasterGlow } from "./paxter-fx/PaxterRasterGlow";

/** Official symbol engine and raster lettering share the same 12-second cycle. */
export function PaxmedLiveLogo() {
  return (
    <span className="paxmed-live-logo">
      <PaxterSymbolGlass size={38} tone="dark" />
      <span className="paxmed-live-logo-copy">
        <PaxterRasterGlow
          facePng={wordmarkAsset.url}
          faceCleanPng={wordmarkAsset.url}
          width={150}
          cycleDelay={900}
          className="paxmed-live-logo-word"
          alt="PAXMED"
        />
        <span className="paxmed-live-logo-subtitle">UMA EMPRESA PADCOM</span>
      </span>
    </span>
  );
}