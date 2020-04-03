import googleMaps from '@googlemaps/google-maps-services-js'
import Joi from '@hapi/joi'
import moment from 'moment-timezone'
import geoTz from 'geo-tz'

import restifyErrors from 'restify-errors'
import { Location } from '../models/index.js'
import { logger, busyHours } from '../libs/index.js'
import { dump } from '../utils/index.js'

const { Client } = googleMaps
const { InvalidArgumentError } = restifyErrors
const {
  INTERSECTION_DELTA_MINUTES,
  GOOGLE_MAPS_API_KEY,
} = process.env
const client = new Client({})

export default async (req, res) => {
  try {
    const schema = Joi.object().keys({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required(),
      radius: Joi.number().required(),
      uuid: Joi.string().required(),
    })

    const { error, value } = schema.validate(req.query)

    if (error) {
      const errMsg = error.details.map((detail) => detail.message).join('. ')

      throw new InvalidArgumentError(errMsg)
    }

    const devicesNearby = await Location.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [value.longitude,value.latitude],
          },
          distanceField: 'distance',
          spherical: true,
          maxDistance: value.radius,
          limit: 100000,
        },
      }, {
        $match: {
          createdAt: {
            $gt: moment().subtract(parseInt(INTERSECTION_DELTA_MINUTES, 10), 'minutes').toDate(),
          },
        },
      }, {
        $group: {
          _id: '$device',
          device: { $first: '$device' },
          location: { $first: '$location' },
          time: { $first: '$createdAt' },
        },
      }, {
        $lookup:
          {
            from: 'devices',
            localField: 'device',
            foreignField: '_id',
            as: 'device',
          },
      },
      {
        $project: {
          _id: false,
          uuid: { $arrayElemAt: ['$device.uuid', 0] },
          location: true,
          time: { $subtract: ['$time', new Date('1970-01-01')] },
        },
      },
      {
        $match: {
          uuid: { $ne: value.uuid },
        },
      },
    ])

    const timezone = geoTz(value.latitude, value.longitude)[0]
    const dayOfWeek = moment().tz(timezone).isoWeekday() // .format('ddd')
    const places = await client
      .placesNearby({
        params: {
          location: {
            lat: value.latitude,
            lng: value.longitude,
          },
          radius: 500,
          key: GOOGLE_MAPS_API_KEY,
        },
        timeout: 1000, // milliseconds
      })

    // console.dir(places.data.results, { depth: 20, colors: true })

    const busyHoursResult = await Promise.all(places.data.results.map(place => client.placeDetails({
      params: {
        place_id: place.place_id,
        key: GOOGLE_MAPS_API_KEY,
      },
    }).then(async placeInfo => {
      console.dir(placeInfo.data.result, { depth: 20, colors: true })

      const busyHoursResult = await busyHours(placeInfo.data.result.url)

      if (!busyHoursResult || !busyHoursResult.week || busyHoursResult.week.length !== 7) {
        return null
      }

      return {
        placeId: placeInfo.data.result.place_id,
        name: placeInfo.data.result.name,
        address: placeInfo.data.result.address_components.map(v => v.long_name).join(', '),
        location: {
          type: 'Point',
          coordinates: [placeInfo.data.result.geometry.location.lng, placeInfo.data.result.geometry.location.lat],
        },
        busyPercentage: busyHoursResult.week[dayOfWeek].hours,
      }
    },
    )))

    res.setHeader('Content-Type', 'application/json')
    return res.json({
      users: devicesNearby.map(dump.dumpUserLocation),
      places: busyHoursResult.filter(Boolean).map(dump.dumpPlace),
    })
  } catch(err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
