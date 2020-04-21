import restifyErrors from 'restify-errors'
import { redis, busyHours as fetchBusyHours } from '../libs/index.js'

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

const weekDays = {
  'Sun': 0,
  'Mon': 1,
  'Tue': 2,
  'Wed': 3,
  'Thu': 4,
  'Fri': 5,
  'Sat': 6,
}

export default async place => {
  let busyHours = false

  const isPlaceExcluded = await redis.getAsync(`exclude__${place.placeId}`)
  if (isPlaceExcluded) {
    throw new NotFoundError(`No data for place ${place.placeId}`)
  }

  busyHours = await redis.getAsync(place.placeId)

  if(!busyHours) {
    busyHours = await fetchBusyHours(place.url)

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
          busyPercentage: busyHours.week,
        },
      }

      await redis.setAsync(dataToCache.properties.placeId, dataToCache)

      busyHours = busyHours.week

    } else {
      await redis.setAsync(`exclude__${place.placeId}`, place.placeId)
    }
  } else {
    busyHours = busyHours.properties.busyPercentage.map(googleBusyHours => ({
      dayOfWeek: weekDays[googleBusyHours.day],
      timeRange: googleBusyHours.hours.reduce(
        (acc, busyHour) => {
          const range = timeRanges.find(r => busyHour.hour >= r.from && busyHour.hour < r.to)

          if (range) {
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
