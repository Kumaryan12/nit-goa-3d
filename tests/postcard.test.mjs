import test from 'node:test'
import assert from 'node:assert/strict'
import { POSTCARD_CAPTIONS, postcardCrop, postcardLayout, postcardShareText, postcardText, renderPostcard } from '../src/lib/postcard.ts'

test('postcard crops preserve aspect ratio and remain within phone and desktop captures', () => {
  for (const format of ['landscape', 'portrait', 'story']) {
    const layout = postcardLayout(format)
    assert.ok(layout.width <= 1600 && layout.height <= 1920)
    assert.ok(layout.image.y + layout.image.height + 150 < layout.height)
    for (const [width, height] of [[390, 844], [1920, 1080], [2560, 1080], [320, 320], [1, 1]]) {
      const crop = postcardCrop(width, height, layout.image.width, layout.image.height)
      assert.ok(crop.x >= -1e-8 && crop.y >= -1e-8)
      assert.ok(crop.x + crop.width <= width + 1e-8 && crop.y + crop.height <= height + 1e-8)
      assert.ok(Math.abs(crop.width / crop.height - layout.image.width / layout.image.height) < 1e-8)
      assert.ok(Math.abs(crop.x * 2 + crop.width - width) < 1e-8)
      assert.ok(Math.abs(crop.y * 2 + crop.height - height) < 1e-8)
    }
  }
  for (const bad of [0, -1, Infinity, NaN]) assert.throws(() => postcardCrop(bad, 200, 300, 400), /not ready/)
})

test('social exports use feed and story ratios with room for app overlays', () => {
  const post = postcardLayout('portrait'), story = postcardLayout('story')
  assert.equal(post.width / post.height, 4 / 5)
  assert.equal(story.width / story.height, 9 / 16)
  assert.ok(story.top >= 160 && story.bottom >= 200)
  assert.ok(story.image.y + story.image.height + 80 < story.height - story.bottom)
  assert.equal(postcardShareText('', ''), `${POSTCARD_CAPTIONS[0]}\n\nNIT Goa\nExplore NIT Goa in 3D → https://nitg-explored.pages.dev`)
  assert.ok(!postcardShareText('hi\u0000\nthere', 'Nescafé').includes('\u0000'))
})

test('postcard captions remove control characters and preserve whole Unicode characters', () => {
  assert.equal(postcardText('  Hello\n\u0000 campus\t friends  '), 'Hello campus friends')
  assert.equal(postcardText('☕🏝️ Goa', 2), '☕🏝')
  assert.equal(Array.from(postcardText('🙂'.repeat(90))).length, 72)
})

test('postcard export fails cleanly when the browser cannot allocate a 2D canvas', async () => {
  const original = globalThis.document
  globalThis.document = { createElement: () => ({ getContext: () => null }) }
  try {
    await assert.rejects(renderPostcard({ width: 100, height: 100 }, { format: 'portrait', theme: 'paper', caption: '', place: '', takenAt: new Date() }), /could not create/)
  } finally { if (original === undefined) delete globalThis.document; else globalThis.document = original }
})
