import googleMaps from '@googlemaps/google-maps-services-js'
import restifyErrors from 'restify-errors'
import { redis, busyHours as fetchBusyHours } from '../libs/index.js'

const { Client } = googleMaps
const { NotFoundError } = restifyErrors
const timeRanges = [{
  name: '9am - 12pm',
  from: 9,
  to: 12,
}, {
  name: '12pm - 3pm',
  from: 12,
  to: 15,
}, {
  name: '3pm - 6pm',
  from: 15,
  to: 18,
}, {
  name: '6pm - 9pm',
  from: 18,
  to: 21,
}]
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

export default async (name, address, latitude, longitude) => {
  let busyHours = false
  const { data: { predictions: [{ place_id: placeId } = { place_id: false }] } } = await client
    .placeAutocomplete({
      params: {
        location: {
          lat: latitude,
          lng: longitude,
        },
        input: `${name} ${address}`,
        key: GOOGLE_MAPS_API_KEY,
      },
      timeout: 1000,
    })

  if (!placeId) {
    throw new NotFoundError('No data for that place')
  }
  const isPlaceExcluded = await redis.getAsync(`exclude__${placeId}`)
  if (isPlaceExcluded) {
    throw new NotFoundError('No data for that place')
  }

  busyHours = await redis.getAsync(placeId)

  if(!busyHours) {
    const placeDetails = await client.placeDetails({
      params: {
        place_id: placeId,
        key: GOOGLE_MAPS_API_KEY,
      },
    })

    if (placeDetails.data.error_message && placeDetails.data.error_message.length) {
      throw new Error(placeDetails.data.error_message)
    }

    busyHours = await fetchBusyHours(placeDetails.data.result.url)

    if (busyHours) {
      const dataToCache = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [placeDetails.data.result.geometry.location.lng, placeDetails.data.result.geometry.location.lat],
        },
        properties: {
          placeId: placeDetails.data.result.place_id,
          name: placeDetails.data.result.name,
          address: placeDetails.data.result.address_components.map(v => v.long_name).join(', '),
          busyPercentage: busyHours.week,
        },
      }

      await redis.setAsync(dataToCache.properties.placeId, dataToCache)

      busyHours = busyHours.week

    } else {
      await redis.setAsync(`exclude__${placeId}`, placeId)
    }
  } else {
    busyHours = busyHours.properties.busyPercentage.map(googleBusyHours => ({
      dayOfWeek: weekDays[googleBusyHours.day],
      timeRange: googleBusyHours.hours.reduce(
        (acc, busyHour) => {
          const range = timeRanges.find(r => busyHour.hour >= r.from && busyHour.hour < r.to)

          if (range) {
            console.dir({ range, acc }, { depth: 20, colors: true })

            const t = acc.find(r => r.timeRange === range.name)

            t.load += busyHour.percentage
            t.counter++
          }

          return acc
        },
        [{
          timeRange: '9am - 12pm',
          load: 0,
          counter: 0,
        }, {
          timeRange: '12pm - 3pm',
          load: 0,
          counter: 0,
        }, {
          timeRange: '3pm - 6pm',
          load: 0,
          counter: 0,
        }, {
          timeRange: '6pm - 9pm',
          load: 0,
          counter: 0,
        }],
      )
        .map(busyHour => ({
          timeRange: busyHour.timeRange,
          load: (busyHour.load / busyHour.counter).toFixed(2),
        })),
    }))
  }

  return { busyHours }
}
