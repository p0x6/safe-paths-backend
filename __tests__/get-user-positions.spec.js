import sinon from 'sinon'
import uuid from 'uuid'
import request from 'supertest-promised'
import { Location, Device } from '../src/models/index.js'
import { app } from '../src/index.js'

const uuidv4 = uuid.v4
const { API_PREFIX } = process.env
let device1
let device2

describe('location', () => {
  beforeEach(async () => {
    await Device.remove()
    await Location.remove()
    device1 = await new Device({
      uuid: uuidv4(),
    }).save()
    device2 = await new Device({
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

  it.only('should save location', async () => {
    const RADIUS = 200
    const LATITUDE = 50.520376
    const LONGITUDE = 30.465005

    const response = await request(app)
      .get(`${API_PREFIX}/get-user-positions?radius=${RADIUS}&latitude=${LATITUDE}&longitude=${LONGITUDE}`)
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
        uuid: device2.uuid,
      }, {
        location: {
          latitude: sinon.match.number,
          longitude: sinon.match.number,
        },
        time: sinon.match.number,
        uuid: device1.uuid,
      }],
    )
  })
})
