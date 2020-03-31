import axios from 'axios'
import uuid from 'uuid'

const uuidv4 = uuid.v4

const BACKEND_API_URL='https://safe-path.herokuapp.com/api/v0'

const random = (min, max) => (Math.random() * (min - max) + max).toFixed(6)

const main = async () => {
  const mockArray = []

  for(let i=0;i<=1000;i++) {
    const deviceUUID = uuidv4()
    const mockData = {
      uuid: deviceUUID,
      coordinates: {
        longitude: random(-122.4, -122.5),
        latitude: random(37.7, 37.8),
      },
    }
    console.dir(mockData, { depth: 20, colors: true })

    mockArray.push(mockData)
  }

  console.log('Sending requests')

  await Promise.all(
    mockArray.map(mock => axios.post(
      `${BACKEND_API_URL}/save-my-location`,
      mock,
    )),
  )

  console.log('DONE')
}

main()
