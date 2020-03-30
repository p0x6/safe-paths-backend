import uuid from 'uuid'
import request from 'supertest'
// import { Location } from '../src/models/index.js'
import { app } from '../src/index.js'

const uuidv4 = uuid.v4
const { API_PREFIX } = process.env
const random = (min, max) => Math.floor(Math.random() * (+max - +min)) + +min

describe('location', () => {
  it('should save location', async () => {
    const data = {
      uuid: uuidv4(),
      coordinates: {
        longitude: random(-180, 180),
        latitude: random(-90,90),
      },
    }
    await request(app)
      .post(`${API_PREFIX}/save-my-location`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send(data)
      .set('Accept', 'application/json')
      .expect(204)
  })
})
