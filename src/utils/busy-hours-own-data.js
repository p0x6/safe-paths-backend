
import geoTz from 'geo-tz'
import area from '@turf/area'
import moment from 'moment-timezone'
import axios from 'axios'
import restifyErrors from 'restify-errors'
import { Location } from '../models/index.js'

const { NotFoundError } = restifyErrors
const { INTERSECTION_DELTA_MINUTES } = process.env
const timeRanges = ['9am - 12pm', '12pm - 3pm', '3pm - 6pm', '6pm - 9pm']

// JS      Monday-1 Tuesday-2 ... Sunday-7
// Mongodb Sunday-1 Monday-2 ... Saturday-7
const dayOfWeeks = {
  1: 7,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
}

const theoreticalPeopleDensity = area => area / 13.378

const countCertainDays = (day, startDate, endDate) => {
  const ndays = 1 + Math.round((endDate-startDate)/(24*3600*1000))

  return Math.floor((ndays + (startDate.getDay()+6-day) % 7) / 7)
}

const fillMissingTimeRanges = (busyHours, placeArea) => {
  const startDate = moment().subtract(6, 'month').toDate()
  const endDate = moment().toDate()

  for (let i=1;i<8;i++) {
    if(!busyHours.find(b => b.dayOfWeek === i)) {
      busyHours.push({ dayOfWeek: i,timeRange: [] })
    }
  }

  return busyHours
    .map(busyHour => {
      busyHour.timeRange = busyHour.timeRange || []

      busyHour.timeRange.sort(
        (a, b) => timeRanges.findIndex(r => r === a.timeRange) > timeRanges.findIndex(r => r === b.timeRange) ? 1 : -1,
      )

      timeRanges.forEach((range, index) => {
        if (!busyHour.timeRange[index] || busyHour.timeRange[index].timeRange !== range) {
          busyHour.timeRange.splice(index, 0, { timeRange: range, load: 0 })
        } else {
          busyHour.timeRange[index].load = busyHour.timeRange[index].load / countCertainDays(dayOfWeeks[busyHour.dayOfWeek], startDate, endDate) / theoreticalPeopleDensity(placeArea)
        }
      })

      return busyHour
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
}

export default async openRoutePlaceId => {
  const { data: openRoutePlace } = await axios({
    method: 'GET',
    url: `http://overpass-api.de/api/interpreter?data=[out:json];way(${openRoutePlaceId});out geom;`,
  })

  if (openRoutePlace.elements.length === 0) {
    throw new NotFoundError(`Place with id of '${openRoutePlaceId}' not found`)
  }

  const placePolygon = openRoutePlace.elements[0].geometry
    .reduce((polygon, coordinates) => {
      polygon.coordinates[0].push([coordinates.lon, coordinates.lat])
      return polygon
    }, {
      type: 'Polygon',
      coordinates: [[]],
    })

  const timezone = geoTz(placePolygon.coordinates[0][0][1], placePolygon.coordinates[0][0][0])[0]
  const placeArea = area.default(placePolygon)

  const calculatedBusyHours = await Location.aggregate([{
    $match: {
      $and: [{
        createdAt: {
          $gt: moment().tz(timezone).subtract(6, 'month').toDate(),
        },
      }, {
        location: {
          $geoWithin: {
            $geometry: placePolygon,
          },
        },
      }],
    },
  }, {
    $project: {
      device: true,
      dayOfWeek: {
        $dayOfWeek: {
          date: '$createdAt',
          timezone,
        },
      },
      timeRange: {
        $concat: [
          { $cond: [{ $lt: [{ $hour: { date: '$createdAt', timezone } },9] }, 'Unknown', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 9] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 12] }] }, '9am - 12pm', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 12] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 15] }] }, '12pm - 3pm', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 15] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 18] }] }, '3pm - 6pm', ''] },
          { $cond: [{ $and: [{ $gte: [{ $hour: { date: '$createdAt', timezone } }, 18] }, { $lt: [{ $hour: { date: '$createdAt', timezone } }, 21] }] }, '6pm - 9pm', ''] },
          { $cond: [{ $gte: [{ $hour: { date: '$createdAt', timezone } },21] }, 'Unknown', ''] },
        ],
      },
    },
  }, {
    $group: {
      _id: {
        dayOfWeek: '$dayOfWeek',
        timeRange: '$timeRange',
      },
      load: { $sum: 1 },
    },
  }, {
    $match: {
      '_id.timeRange': { $ne: 'Unknown' },
    },
  }, {
    $group: {
      _id: '$_id.dayOfWeek',
      timeRange: { $push: { timeRange: '$_id.timeRange', load: '$load' } },
    },
  }, {
    $project: {
      _id: false,
      dayOfWeek: '$_id',
      timeRange: '$timeRange',
    },
  }])

  const [{ count: devicesAtPlaceNow = 0 } = { load: 0 }] = await Location.aggregate([{
    $match: {
      $and: [{
        createdAt: {
          $gt: moment().tz(timezone).subtract(INTERSECTION_DELTA_MINUTES, 'minutes').toDate(),
        },
      }, {
        location: {
          $geoWithin: {
            $geometry: placePolygon,
          },
        },
      }],
    },
  }, {
    $group: {
      _id: '$device',
    },
  }, {
    $group: {
      _id: null,
      count: { $sum: 1 },
    },
  }, {
    $project: {
      _id: false,
      count: true,
    },
  }])

  return {
    devicesAtPlaceNow: devicesAtPlaceNow / theoreticalPeopleDensity(placeArea),
    densityNow: devicesAtPlaceNow / theoreticalPeopleDensity(placeArea),
    busyHours: fillMissingTimeRanges(calculatedBusyHours, placeArea),
  }
}
