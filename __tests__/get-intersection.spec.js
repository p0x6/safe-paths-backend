import sinon from 'sinon'
import moment from 'moment'
import uuid from 'uuid'
import request from 'supertest'
import { Location, Device } from '../src/models/index.js'
import { app } from '../src/index.js'

const uuidv4 = uuid.v4
const { API_PREFIX } = process.env
let device1
let device2
let device3

describe('get-intersection', () => {
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
      device: device2._id,
      location: {
        type: 'Point',
        coordinates: [
          30.465188,
          50.520011,
        ],
      },
      createdAt: moment().subtract(5, 'hours').toDate(),
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
      device: device3._id,
      location: {
        type: 'Point',
        coordinates: [
          30.465188,
          50.520011,
        ],
      },
      createdAt: moment().subtract(5, 'hours').toDate(),
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

  it.only('should return intersections', async () => {
    const UUID = device3.uuid

    const response = await request(app)
      .get(`${API_PREFIX}/get-intersection?uuid=${UUID}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send()
      .expect(200)
      .end()
      .get('body')

    sinon.assert.match(
      response,
      [{
        count: 2,
        date: moment().format('YYYY-MM-DD'),
      }],
    )
  })

  it('should return empty array', async () => {
    await Device.deleteMany()
    await Location.deleteMany()
    device1 = await new Device({
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

    const UUID = device1.uuid

    const response = await request(app)
      .get(`${API_PREFIX}/get-intersection?uuid=${UUID}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send()
      .expect(200)
      .end()
      .get('body')

    sinon.assert.match(
      response,
      [],
    )
  })
})
