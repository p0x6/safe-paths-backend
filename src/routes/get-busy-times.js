import googleMaps from '@googlemaps/google-maps-services-js'
import Joi from '@hapi/joi'
import axios from 'axios'
import isPointInPolygon from '@turf/boolean-point-in-polygon'
import circle from '@turf/circle'
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
const { GOOGLE_MAPS_API_KEY, OPENROUTE_API_KEY } = process.env
const client = new Client({})

export default async (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json')
    let busyHours = {}
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        address: Joi.string(),
        placeId: Joi.string().required(),
        type: Joi.string().default('google').valid('google', 'own'),
      }),
    )

    if (data.type === 'own') {
      busyHours = await getBusyHoursBasedOnOwnData(data.placeId)
    } else {

      const placeDetails = await client.placeDetails({
        params: {
          place_id: data.placeId,
          key: GOOGLE_MAPS_API_KEY,
        },
      })

      if (placeDetails.data.error_message && placeDetails.data.error_message.length) {
        throw new Error(placeDetails.data.error_message)
      }

      if (placeDetails.data.status === 'INVALID_REQUEST') {
        throw new NotFoundError(`Place with id not found ${data.placeId}`)
      }

      const { data: openRoutePlaces } = await axios({
        method: 'GET',
        url: `https://api.openrouteservice.org/geocode/autocomplete?api_key=${OPENROUTE_API_KEY}&text=${encodeURIComponent(placeDetails.data.result.formatted_address)}`,
      })

      const placePolygon = circle.default(
        [
          placeDetails.data.result.geometry.location.lng,
          placeDetails.data.result.geometry.location.lat,
        ],
        120,
        {
          units: 'meters',
        },
      )

      if (
        openRoutePlaces.features
        && openRoutePlaces.features.find(feature => /^way\/\d+/.test(feature.properties.id))
        && isPointInPolygon.default(openRoutePlaces.features.find(feature => /^way\/\d+/.test(feature.properties.id)).geometry, placePolygon)
      ) {
        const feature = openRoutePlaces.features.find(feature => /^way\/\d+/.test(feature.properties.id))

        console.log('####', isPointInPolygon.default(feature.geometry, placePolygon), feature.geometry)

        if (feature.properties.id) {
          const wayId = /^way\/(\d+)/.exec(feature.properties.id)[1]
          console.log('OWN_DATA')
          busyHours = await getBusyHoursBasedOnOwnData(wayId)
        }
      } else {
        console.log('GOOGLE_DATA')
        busyHours = await getBusyHoursBasedOnGoogleMaps(data.placeId)
      }

    }

    return res.json(busyHours)
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
