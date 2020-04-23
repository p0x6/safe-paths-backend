import googleMaps from '@googlemaps/google-maps-services-js'
import restifyErrors from 'restify-errors'
import { redis } from '../libs/index.js'

const { NotFoundError } = restifyErrors
const { Client } = googleMaps
const { GOOGLE_MAPS_API_KEY } = process.env
const client = new Client({})

export default async placeId => {
  let placeDetails = await redis.getAsync(placeId)

  if (placeDetails) {
    return {
      ...placeDetails.properties,
      coordinates: {
        latitude: placeDetails.geometry.coordinates[1],
        longitude: placeDetails.geometry.coordinates[0],
      },
    }
  }

  ({ data: placeDetails } = await client.placeDetails({
    params: {
      place_id: placeId,
      key: GOOGLE_MAPS_API_KEY,
    },
  }))

  if (placeDetails.error_message && placeDetails.error_message.length) {
    throw new Error(placeDetails.error_message)
  }
  if (placeDetails.status === 'INVALID_REQUEST') {
    throw new NotFoundError(`Place with id not found ${placeId}`)
  }

  return {
    placeId: placeDetails.result.place_id,
    url: placeDetails.result.url,
    name: placeDetails.result.name,
    address: placeDetails.result.formatted_address,
    coordinates: {
      latitude: placeDetails.result.geometry.location.lat,
      longitude: placeDetails.result.geometry.location.lng,
    },
  }
}
