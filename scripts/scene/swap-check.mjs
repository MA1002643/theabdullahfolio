// Does the still-to-video swap POP at the flames? Everything outside the two
// masks is the plate by construction (the bake asserts it), so the only place
// the swap can show is inside a flame window — where the plate's frozen fire
// gives way to the clip's frame 0.
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
// FFMPEG= overrides the bundled binary, as scripts/scene/README.md promises.
const ffmpeg = process.env.FFMPEG ?? ffmpegStatic;
import { WORK } from './workdir.mjs';

const SP = WORK;
const RIG = await import(
  `data:text/javascript;base64,${Buffer.from(
    readFileSync('src/components/home/homeSceneLights.js', 'utf8'),
  ).toString('base64')}`
);
const { IW, IH, FIRE_BOX, fireBoxAlpha, flameSources } = RIG;
const W = 1920, H = 1080, PLATE_OPACITY = 0.9;

execFileSync(ffmpeg, ['-v','error','-y','-i','public/background/causeway-1080.mp4','-frames:v','1',`${SP}/v0.png`]);
const v0 = await sharp(`${SP}/v0.png`).resize(W,H).removeAlpha().raw().toBuffer();
const plate = await sharp('public/background/home-hero.webp')
  .resize(W,H,{fit:'cover',position:'centre'}).removeAlpha().raw().toBuffer();
const lum = (b,i) => 0.2126*b[i*3] + 0.7152*b[i*3+1] + 0.0722*b[i*3+2];

// Frame-to-frame motion inside the loop, for scale: a swap smaller than the
// fire's own step is a flicker, not a pop.
execFileSync(ffmpeg, ['-v','error','-y','-i','public/background/causeway-1080.mp4','-vf','select=eq(n\\,1)','-frames:v','1',`${SP}/v1.png`]);
const v1 = await sharp(`${SP}/v1.png`).resize(W,H).removeAlpha().raw().toBuffer();

console.log('flame   swap RMS   one frame RMS   window mean: plate vs video');
for (const s of flameSources()) {
  const cx=s.u*W, cy=s.v*H, rx=(s.r/IW)*W, ry=(s.r/IH)*H;
  let swap=0, step=0, mp=0, mv=0, n=0;
  for (let y=Math.floor(cy-ry*1.3); y<=Math.ceil(cy+ry*1.2); y+=1)
    for (let x=Math.floor(cx-rx*1.1); x<=Math.ceil(cx+rx*1.1); x+=1) {
      if (x<0||y<0||x>=W||y>=H) continue;
      if (fireBoxAlpha((x+0.5-cx)/rx,(cy-y-0.5)/ry) < 0.5) continue;
      const i=y*W+x;
      const p=lum(plate,i)*PLATE_OPACITY, a=lum(v0,i), b=lum(v1,i);
      swap+=(p-a)**2; step+=(a-b)**2; mp+=p; mv+=a; n+=1;
    }
  console.log(`${String(s.i).padStart(2)}      ${Math.sqrt(swap/n).toFixed(1).padStart(5)}      ${Math.sqrt(step/n).toFixed(1).padStart(5)}          ${(mp/n).toFixed(1)} vs ${(mv/n).toFixed(1)}`);
}
