import googleMaps from '@googlemaps/google-maps-services-js'
import Joi from '@hapi/joi'
import moment from 'moment-timezone'
import geoTz from 'geo-tz'
import { logger, redis, fetchGoogleBusyHours } from '../libs/index.js'
import { dump, placeTypes, validator } from '../utils/index.js'

const { Client } = googleMaps
const { GOOGLE_MAPS_API_KEY } = process.env
const client = new Client({})

const weekDays = {
  'Sun': 0,
  'Mon': 1,
  'Tue': 2,
  'Wed': 3,
  'Thu': 4,
  'Fri': 5,
  'Sat': 6,
}

const getPlacesNearby = async (latitude, longitude, radius, placeType) => {
  const places = []
  let nextPageToken = true

  while (nextPageToken) {
    const placesOnPage = await client
      .placesNearby({
        params: {
          location: {
            lat: latitude,
            lng: longitude,
          },
          opennow: true,
          type: placeType,
          ...nextPageToken && nextPageToken !== true ? { next_page_token: nextPageToken } : {},
          radius: radius,
          key: GOOGLE_MAPS_API_KEY,
        },
        timeout: 1000, // milliseconds
      })

    nextPageToken = placesOnPage.data.next_page_token
    places.push(...placesOnPage.data.results)
  }

  return places
}

const getPlacesFromCache = async (places, placesMap) => {
  let placesInCache = await Promise.all(places.map(place => redis.getAsync(place.place_id)))

  placesInCache = placesInCache.filter(place => {
    if (place !== null) {
      placesMap[place.properties.placeId] = true
      return true
    }
    return false
  })

  return placesInCache
}

export default async (req, res) => {
  try {
    const data = validator.validate(
      req.query,
      Joi.object().keys({
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required(),
        radius: Joi.number().required(),
        placeType: Joi
          .string()
          .valid(...placeTypes)
          .required(),
      }),
    )

    const userTimezone = geoTz(data.latitude, data.longitude)[0]
    const dayOfWeek = weekDays[moment().tz(userTimezone).format('ddd')]
    console.dir({ dayOfWeek }, { depth: 20, colors: true })

    const placesMap = {}
    const places = await getPlacesNearby(
      data.latitude,
      data.longitude,
      data.radius,
      data.placeType,
    )

    const placesInCache = await getPlacesFromCache(places, placesMap)
    const placesToExclude = []

    let placesNotInCache = places.filter(place => !placesMap[place.place_id])

    if (placesInCache.length < places.length) {
      const placesToExcludeFromCache = await Promise.all(placesNotInCache.map(place => redis.getAsync(`exclude__${place.place_id}`)))

      if (placesToExcludeFromCache.length > 0) {
        placesNotInCache = placesNotInCache.filter(place => !placesToExcludeFromCache.find(excludePlaceId => excludePlaceId === place.place_id))
      }
    }

    let fetchedPlaces = await Promise.all(placesNotInCache.map(place => client.placeDetails({
      params: {
        place_id: place.place_id,
        key: GOOGLE_MAPS_API_KEY,
      },
    }).then(async placeInfo => {
      if (placeInfo.data.error_message && placeInfo.data.error_message.length) {
        throw new Error(placeInfo.data.error_message)
      }

      const fetchGoogleBusyHoursResult = await fetchGoogleBusyHours(placeInfo.data.result.url)

      if (!fetchGoogleBusyHoursResult) {
        placesToExclude.push(placeInfo.data.result.place_id)
        return false
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
          busyPercentage: fetchGoogleBusyHoursResult,
        },
      }
    })))

    fetchedPlaces = fetchedPlaces.filter(Boolean).map(dump.dumpPlace)

    await Promise.all(placesToExclude.map(placeId => redis.setAsync(`exclude__${placeId}`, placeId)))
    await Promise.all(fetchedPlaces.map(place => redis.setAsync(place.properties.placeId, place)))

    res.setHeader('Content-Type', 'application/json')
    return res.json({
      type: 'FeatureCollection',
      features: [
        ...fetchedPlaces,
        ...placesInCache,
      ]
        .map(place => {
          if (place.properties.busyPercentage) {
            console.dir({ aaa: place.properties.busyPercentage }, { depth: 20, colors: true })

            place.properties.busyPercentage = place.properties.busyPercentage.find(b => b.dayOfWeek === dayOfWeek).timeRange
          }

          return place
        }),
    })
  } catch (err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
