import restifyErrors from 'restify-errors'
import { redis, fetchGoogleBusyHours } from '../libs/index.js'

const { NotFoundError } = restifyErrors

export default async place => {
  let busyHours = false

  const isPlaceExcluded = await redis.getAsync(`exclude__${place.placeId}`)
  if (isPlaceExcluded) {
    throw new NotFoundError(`No data for place ${place.placeId}`)
  }

  busyHours = await redis.getAsync(place.placeId)

  if(!busyHours) {
    busyHours = await fetchGoogleBusyHours(place.url)

    if (busyHours) {
      const dataToCache = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [place.coordinates.longitude, place.coordinates.latitude],
        },
        properties: {
          placeId: place.placeId,
          name: place.name,
          address: place.address,
          busyPercentage: busyHours,
        },
      }

      await redis.setAsync(dataToCache.properties.placeId, dataToCache)
    } else {
      await redis.setAsync(`exclude__${place.placeId}`, place.placeId)
    }
  } else {
    busyHours = busyHours.properties.busyPercentage
  }

  return { busyHours }
}
