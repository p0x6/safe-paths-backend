import googleMaps from '@googlemaps/google-maps-services-js'
import Joi from '@hapi/joi'
import moment from 'moment-timezone'
import geoTz from 'geo-tz'

import restifyErrors from 'restify-errors'
import { Location } from '../models/index.js'
import { logger, busyHours, redis } from '../libs/index.js'
import { dump } from '../utils/index.js'

const { Client } = googleMaps
const { InvalidArgumentError } = restifyErrors
const {
  INTERSECTION_DELTA_MINUTES,
  GOOGLE_MAPS_API_KEY,
} = process.env
const client = new Client({})

export default async(req, res) => {
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

    const devicesNearby = await Location.aggregate([{
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [value.longitude, value.latitude],
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
      $lookup: {
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
    const placesMap = {}
    const places = []
    const placesToExclude = []
    let nextPageToken = true

    while (nextPageToken) {
      const placesOnPage = await client
        .placesNearby({
          params: {
            location: {
              lat: value.latitude,
              lng: value.longitude,
            },
            // type: 'establishment',
            // opennow: false,
            ...nextPageToken && nextPageToken !== true ? { next_page_token: nextPageToken } : {},
            radius: value.radius,
            key: GOOGLE_MAPS_API_KEY,
          },
          timeout: 1000, // milliseconds
        })

      nextPageToken = placesOnPage.data.next_page_token

      // console.dir({ nextPageToken }, { depth: 20, colors: true })

      places.push(...placesOnPage.data.results)
    }

    let placesInCache = await Promise.all(places.map(place => redis.getAsync(place.place_id)))

    placesInCache = placesInCache.filter(place => {
      if (place !== null) {
        placesMap[place.placeId] = true
        return true
      }
      return false
    })

    let placesNotInCache = places.filter(place => !placesMap[place.place_id])

    if (placesInCache.length > 0) {
      let placesToExclude = await Promise.all(placesNotInCache.map(place => redis.getAsync(`exclude__${place.place_id}`)))

      if (placesToExclude.length > 0) {
        placesNotInCache = placesNotInCache.filter(place => !placesToExclude.find(excludePlaceId => excludePlaceId !== place.place_id))
      }
    }

    let fetchedPlaces = await Promise.all(placesNotInCache.map(place => client.placeDetails({
      params: {
        place_id: place.place_id,
        key: GOOGLE_MAPS_API_KEY,
      },
    }).then(async placeInfo => {
      const busyHoursResult = await busyHours(placeInfo.data.result.url)

      if (
        !busyHoursResult
        || !busyHoursResult.week
        || busyHoursResult.week.length !== 7
        || !busyHoursResult.week[dayOfWeek]
        || !busyHoursResult.week[dayOfWeek].hours
        || busyHoursResult.week[dayOfWeek].hours.length === 0
      ) {
        return { placeId: placeInfo.data.result.place_id }
      }

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [placeInfo.data.result.geometry.location.lng, placeInfo.data.result.geometry.location.lat],
        },
        properties: {
          placeId: placeInfo.data.result.place_id,
          name: placeInfo.data.result.name,
          address: placeInfo.data.result.address_components.map(v => v.long_name).join(', '),
          busyPercentage: busyHoursResult.week[dayOfWeek].hours,
        },
      }
    })))

    fetchedPlaces = fetchedPlaces
      .filter(place => {
        if (Object.keys(place).length === 1 && !!place.placeId) {
          placesToExclude.push(place.placeId)

          return false
        }

        return true
      })
      .map(dump.dumpPlace)

    await Promise.all(placesToExclude.map(placeId => redis.setAsync(`exclude__${placeId}`, placeId)))
    await Promise.all(fetchedPlaces.map(place => redis.setAsync(place.properties.placeId, place)))

    res.setHeader('Content-Type', 'application/json')
    return res.json({
      users: {
        type: 'FeatureCollection',
        features: devicesNearby.map(dump.dumpUserLocation),
      },
      places: {
        type: 'FeatureCollection',
        features: [...fetchedPlaces, ...placesInCache],
      },
    })
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}