import test from 'node:test'
import assert from 'node:assert/strict'
import { Group, PerspectiveCamera, Scene } from 'three'
import { photoGroup } from '../src/lib/photoGroup.ts'
import { postcardLayout, postcardNames, postcardPeopleInCrop, postcardShareText } from '../src/lib/postcard.ts'

test('group suggestions use rendered avatars in front of the camera, nearby on the same floor', () => {
  const scene = new Scene(), camera = new PerspectiveCamera(60, 16 / 9, .1, 1000)
  camera.position.set(0, 3, 10); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true)
  const local = { x: 0, y: 0, z: 0, visible: true, space: 'outdoors' }
  const people = []
  for (const [id, x, z, visible, space] of [['self', 0, 0, true, 'outdoors'], ['bob', 2, 0, true, 'outdoors'], ['behind', 0, 20, true, 'outdoors'], ['far', 40, -50, true, 'outdoors'], ['hidden', -1, 0, false, 'outdoors'], ['floor', -2, 0, true, 'hostel:1']]) {
    const root = new Group(); root.position.set(x, 0, z); root.visible = visible; root.userData.photoPersonId = id; scene.add(root)
    people.push({ id, name: id === 'self' ? 'Aryan' : id, pose: { ...local, x, z, visible, space } })
  }
  const unlisted = new Group(); unlisted.userData.photoPersonId = 'unknown'; scene.add(unlisted)
  scene.updateMatrixWorld(true)
  const found = photoGroup(scene, camera, people, 'self', local, true)
  assert.deepEqual(found.map(person => person.name), ['Aryan', 'bob'])
  assert.ok(found.every(person => person.x >= 0 && person.x <= 1 && person.y >= 0 && person.y <= 1))
  assert.deepEqual(Object.keys(found[0]).sort(), ['id', 'name', 'x', 'y'])
  assert.deepEqual(photoGroup(scene, camera, people, 'self', local, false), [])
  assert.deepEqual(photoGroup(scene, camera, people, 'self', { ...local, visible: false }, true), [])
  people[1].name = 'Changed after capture'
  assert.equal(found[1].name, 'bob', 'capture names are frozen rather than live roster references')
})

test('name suggestions follow the actual export crop and never repeat or invent names', () => {
  const people = [{ id: 'left', name: 'Left', x: .05, y: .5 }, { id: 'middle', name: 'Aryan', x: .5, y: .5 }, { id: 'middle', name: 'Duplicate', x: .5, y: .5 }, { id: 'bad', name: 'Invalid', x: NaN, y: .5 }]
  const cropped = postcardPeopleInCrop(people, 1920, 1080, 'story', true)
  assert.deepEqual(cropped.map(person => person.name), ['Aryan'])
  assert.equal(people.length, 4)
  assert.equal(postcardNames(Array.from({ length: 20 }, (_, i) => `Name ${i}`)).length, 8)
  assert.deepEqual(postcardNames(['Aryan\u202e', '  ', 'Coffee\ncrew']), ['Aryan', 'Coffee crew'])
  assert.ok(postcardShareText('Hello', 'OAT', ['Aryan', 'Dev']).includes('With Aryan · Dev'))
  assert.ok(!postcardShareText('Hello', 'OAT').includes('With '))
  for (const format of ['portrait', 'story', 'landscape']) {
    const plain = postcardLayout(format), named = postcardLayout(format, true)
    assert.equal(plain.height, named.height)
    assert.equal(plain.image.height - named.image.height, 72)
    assert.ok(named.image.y + named.image.height + 158 < named.height - named.bottom)
  }
})
