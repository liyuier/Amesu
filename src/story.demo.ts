// story.demo.ts —— 用「类型安全 JS/TS API」定义剧本（设计 §4.4 的“脚本轨”第一公民）。
// 与 JSON 剧本等价；二者均由 createEngine 消费（引擎双轨：JSON / JS 脚本）。
import { story } from '@engine';
export const demoStory = story
  .meta({ title: '雨夜初遇', res: './assets' })
  .start('scene_start')
  .scene('scene_start', (s) => {
    s.bg('bg/city_warm.jpg', { transition: 'fade', duration: 800 });
    s.bgm('audio/bgm/theme.mp3', { loop: true, volume: 0.6, fade: 1200 });
    s.char('hero', { at: 'center', expr: 'happy', z: 10, effect: 'fade-in', duration: 500 });
    s.say('hero', '雨夜里……就我们两个人。', { typewriter: 45 });
    s.wait(600);
    s.camera({ move: { x: 14, y: -6, zoom: 1.05 }, duration: 1400, easing: 'ease-out' });
    s.say('hero', '要不要看看这场雨？', { typewriter: 40 });
    s.choice([
      { text: '看看特效', jump: 'scene_fx' },
      { text: '直接开始', jump: 'scene_play' },
    ]);
  })
  .scene('scene_fx', (s) => {
    s.effect('particle:rain', { count: 300, speed: 400, angle: 12, duration: 3600 });
    s.say('hero', '效果不错吧。', { typewriter: 40 });
    s.wait(300);
    s.jump('scene_play');
  })
  .scene('scene_play', (s) => {
    s.say('hero', '那么，演出开始。', { typewriter: 50 });
    s.wait(800);
    s.control('stop');
  })
  .build();
