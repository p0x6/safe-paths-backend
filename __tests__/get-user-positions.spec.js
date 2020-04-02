import sinon from 'sinon'
import uuid from 'uuid'
import request from 'supertest-promised'
import { Location, Device } from '../src/models/index.js'
import { app } from '../src/index.js'

const uuidv4 = uuid.v4
const { API_PREFIX } = process.env
let device1
let device2
let device3

describe('get-user-positions', () => {
  beforeEach(async function() {
    this.timeout(3000)

    await Device.deleteMany()
    await Location.deleteMany()
    device1 = await new Device({
      uuid: uuidv4(),
    }).save()
    device2 = await new Device({
      uuid: uuidv4(),
    }).save()
    device3 = await new Device({
      uuid: uuidv4(),
    }).save()
    await new Location({
      device: device1._id,
      location: {
        type: 'Point',
        coordinates: [
          30.465434,
          50.520137,
        ],
      },
    }).save()
    await new Location({
      device: device2._id,
      location: {
        type: 'Point',
        coordinates: [
          30.465188,
          50.520011,
        ],
      },
    }).save()
    await new Location({
      device: device3._id,
      location: {
        type: 'Point',
        coordinates: [
          30.465188,
          50.520011,
        ],
      },
    }).save()
    await new Location({
      device: device1._id,
      location: {
        type: 'Point',
        coordinates: [
          30.457292,
          50.519213,
        ],
      },
    }).save()
  })

  it('should return devices in specific location, except your device', async () => {
    const RADIUS = 200
    const LATITUDE = 50.520376
    const LONGITUDE = 30.465005
    const UUID = device3.uuid

    const response = await request(app)
      .get(`${API_PREFIX}/get-user-positions?radius=${RADIUS}&latitude=${LATITUDE}&longitude=${LONGITUDE}&uuid=${UUID}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send()
      .expect(200)
      .end()
      .get('body')

    sinon.assert.match(
      response,
      [{
        location: {
          latitude: sinon.match.number,
          longitude: sinon.match.number,
        },
        time: sinon.match.number,
      }, {
        location: {
          latitude: sinon.match.number,
          longitude: sinon.match.number,
        },
        time: sinon.match.number,
      }],
    )
  })
})
