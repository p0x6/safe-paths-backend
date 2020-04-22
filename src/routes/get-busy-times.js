import googleMaps from '@googlemaps/google-maps-services-js'
import Joi from '@hapi/joi'
import axios from 'axios'
import isPointInPolygon from '@turf/boolean-point-in-polygon'
import restifyErrors from 'restify-errors'
import { logger } from '../libs/index.js'
import {
  dump,
  validator,
  getBusyHoursBasedOnOwnData,
  getBusyHoursBasedOnGoogleMaps,
} from '../utils/index.js'

const { NotFoundError } = restifyErrors
const { Client } = googleMaps
const { GOOGLE_MAPS_API_KEY } = process.env
const client = new Client({})

const makePolygonFromGeometry = geometry => geometry
  .reduce((polygon, coordinates) => {
    polygon.coordinates[0].push([coordinates.lon, coordinates.lat])
    return polygon
  }, {
    type: 'Polygon',
    coordinates: [[]],
  })

const fetchGooglePlaceDetails = async placeId => {
  const { data: placeDetails } = await client.placeDetails({
    params: {
      place_id: placeId,
      key: GOOGLE_MAPS_API_KEY,
    },
  })

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

export default async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json')
    let busyHours = {}
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        placeId: Joi.string().required(),
        type: Joi.string().default('google').valid('google', 'own'),
      }),
    )

    if (data.type === 'own') {
      busyHours = await getBusyHoursBasedOnOwnData(data.placeId)
    } else {
      const place = await fetchGooglePlaceDetails(data.placeId)
      const wayQuery = `
      [out:json];
      way(around:25,${place.coordinates.latitude},${place.coordinates.longitude})
      ;out geom;
      `
      const { data: openRoutePlaces = { elements: [] } } = await axios({
        method: 'GET',
        url: `http://overpass-api.de/api/interpreter?data=${wayQuery}`,
      })
      const way = openRoutePlaces.elements.find(
        element => isPointInPolygon.default(
          {
            type: 'Point',
            coordinates: [
              place.coordinates.longitude,
              place.coordinates.latitude,
            ],
          },
          makePolygonFromGeometry(element.geometry),
        ),
      )

      if (way) {
        console.log('OWN_DATA')
        busyHours = await getBusyHoursBasedOnOwnData(way.id)

        const emptyRanges = busyHours.busyHours.reduce(
          (acc, busyHour) => {
            const empty = busyHour.timeRange.filter(r => r.load === 0).length
            return acc + empty
          },
          0,
        )

        if (emptyRanges > 2) {
          console.log('NOT_ENOUGH_OWN_DATA')
          console.log('GOOGLE_DATA')
          busyHours = await getBusyHoursBasedOnGoogleMaps(place)
        }
      } else {
        console.log('GOOGLE_DATA')
        busyHours = await getBusyHoursBasedOnGoogleMaps(place)
      }

      busyHours = {
        ...busyHours,
        name: place.name,
        address: place.address,
        coordinates: place.coordinates,
      }
    }

    return res.json(busyHours)
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
