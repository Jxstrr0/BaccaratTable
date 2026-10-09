import * as THREE from 'three';
import { Stage } from './scene/stage.js';
import { MaterialLibrary } from './scene/materials.js';
import { buildRoom } from './scene/room.js';
import { buildTable } from './scene/table.js';
import { Dealer } from './scene/dealer.js';
import { SeatCamera } from './scene/camera.js';
import { AudioEngine } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { Game } from './game/game.js';
import { tickTweens, setTimeScale } from './util/tween.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    $('progress-bar').style.width = `${Math.round((loaded / total) * 100)}%`;
  };

  // The felt is painted with the display serif, so wait for it (but never hang on it).
  await Promise.race([
    document.fonts.load('600 64px "Cormorant Garamond"'),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});

  const stage = new Stage($('app'), manager);
  const aniso = Math.min(16, stage.maxAnisotropy);
  const lib = new MaterialLibrary(manager, aniso);

  const room = buildRoom(stage.scene, lib, manager);
  const table = buildTable(lib, aniso);
  stage.scene.add(table.group);

  const dealer = new Dealer(lib);
  dealer.root.position.set(0, 0, -0.98);
  stage.scene.add(dealer.root);

  const rig = new SeatCamera(stage.camera, stage.renderer.domElement);
  const audio = new AudioEngine();

  let game;
  const hud = new Hud({
    selectChip: (d) => game.selectChip(d),
    deal: () => game.deal(),
    clear: () => game.clear(),
    undo: () => game.undo(),
    rebet: () => game.rebet(),
    double: () => game.double(),
    reveal: () => game.squeeze.revealAll(),
    rotate: () => game.squeeze.rotate(),
    resetBankroll: () => game.resetBankroll(),
    setting: (k, v) => game.setting(k, v),
  });

  const envReady = stage.loadEnvironment(`${import.meta.env.BASE_URL}assets/env/warm_bar_1k.hdr`);
  const texturesReady = new Promise((resolve) => {
    manager.onLoad = resolve;
  });
  await Promise.all([envReady, texturesReady]);

  // Compile shaders up front so the first deal doesn't stutter.
  await stage.renderer.compileAsync(stage.scene, stage.camera);

  game = new Game({ stage, table, dealer, rig, audio, hud });
  window.__game = game; // handy for debugging from the console
  window.__stage = stage;
  window.__timeScale = setTimeScale;

  const timer = new THREE.Timer();
  timer.connect(document);
  stage.renderer.setAnimationLoop(() => {
    timer.update();
    const dt = window.__fixedDt ?? Math.min(timer.getDelta(), 0.1);
    tickTweens(dt);
    rig.update(dt);
    dealer.update(dt);
    game.update(dt);
    room.chandelierGlow.material.emissiveIntensity = 6 + Math.sin(timer.getElapsed() * 0.8) * 0.15;
    stage.render();
  });

  $('progress-label').textContent = 'The salon is ready.';
  const enter = $('enter');
  enter.disabled = false;
  enter.focus();
  enter.addEventListener('click', async () => {
    audio.start();
    $('loader').classList.add('hidden');
    hud.show();
    game.start();
  }, { once: true });
}

boot().catch((err) => {
  console.error(err);
  $('progress-label').textContent = `Something went wrong: ${err.message}`;
});
