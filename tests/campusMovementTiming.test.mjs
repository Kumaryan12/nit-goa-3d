import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCampusRoom } from '../server/campusRoom.ts'

const boundary = [{x:-200,z:-200},{x:200,z:-200},{x:200,z:200},{x:-200,z:200},{x:-200,z:-200}]
const pose = (vehicle, x, y = 0) => ({vehicle,x,y,z:0,yaw:0,epoch:1,moving:true,running:false,active:true,visible:true,space:'outdoors'})
function roomFor(vehicle) {
  const room = createCampusRoom(boundary)
  room.add({id:'driver',name:'Driver',role:'member',expiresAt:Date.now()+60000})
  assert.ok(room.pose('driver',pose(vehicle,0),'walk',1000))
  return room
}

test('maximum-speed walking, cycling and buggy travel survive delayed then bunched packets', () => {
  for (const [vehicle,speed] of [['walk',5],['bicycle',7],['buggy',9]]) {
    const room = roomFor(vehicle)
    // TCP preserves order but a 300 ms delay can drain as a burst. Intermediate
    // packets may be throttled; the next normal update must catch up safely.
    const arrivals = [1400,1500,1501,1502,1503,1600,1700,1800]
    for (let i=0;i<arrivals.length;i++) {
      const accepted = room.pose('driver',pose(vehicle,speed*(i+1)/10,speed*(i+1)/10*.3),'walk',arrivals[i])
      if (![2,3,4].includes(i)) assert.ok(accepted,`${vehicle}: rejected valid update ${i}`)
    }
    assert.ok(Math.abs(room.poseFor('driver').x-speed*.8)<1e-8)
  }
})

test('packet throttling is distinct from a speed or boundary violation', () => {
  const room = roomFor('buggy')
  assert.equal(room.updatePose('driver',pose('buggy',.9),'walk',1400),'accepted')
  assert.equal(room.updatePose('driver',pose('buggy',3.6),'walk',1410),'throttled')
  assert.equal(room.poseFor('driver').x,.9,'ignored packets do not relocate the server avatar')
  assert.equal(room.updatePose('driver',pose('buggy',4.5),'walk',1500),'accepted')
  assert.equal(room.updatePose('driver',pose('buggy',100),'walk',1600),'invalid')
  assert.equal(room.updatePose('driver',pose('buggy',250),'walk',1700),'invalid')
})

test('accumulated timing allowance never grants sustained extra speed or unlimited idle catch-up', () => {
  for (const [vehicle,speed] of [['walk',5.8],['bicycle',7.6],['buggy',9.6]]) {
    const room = roomFor(vehicle)
    assert.equal(room.pose('driver',pose(vehicle,100),'walk',101000),false,'idle catch-up remains bounded')
    let rejected = false
    for (let i=1;i<=20;i++) if (!room.pose('driver',pose(vehicle,(speed+.5)*i/10),'walk',1000+i*100)) rejected = true
    assert.ok(rejected,`${vehicle}: repeated per-packet tolerance cannot bypass the speed cap`)
  }
})
