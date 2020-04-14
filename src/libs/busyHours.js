import fetch from 'axios'

const formatOutput = array => {
  return {
    hour: array[0],
    percentage: array[1],
  }
}

const extractData = html => {
  // ACHTUNG! HACKY AF
  let str = ['APP_INITIALIZATION_STATE=', 'window.APP_FLAGS']
  let script = html.substring(html.lastIndexOf(str[0]) + str[0].length, html.lastIndexOf(str[1]))
  // LET'S PARSE THAT MOFO
  let first = eval(script)
  let second = eval(first[3][6].replace(')]}\'', ''))

  return second[6][84]
}

const processHtml = html => {
  let popular_times
  try{
    popular_times = extractData(html)
  } catch(error){
    console.dir(error, { depth: 20, colors: true })
    return null
  }

  if (!popular_times) {
    return null//{ status: 'error', message: 'Place has no popular hours' }
  }


  const data = { status: 'ok' }
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  data.week = Array.from(Array(7).keys()).map(index => {
    let hours = []
    if (popular_times[0][index] && popular_times[0][index][1]) {
      hours = Array.from(popular_times[0][index][1]).map(array => formatOutput(array))
    }
    return {
      day: weekdays[index],
      hours: hours,
    }

  })
  const crowded_now = popular_times[7]

  if (crowded_now !== undefined) {
    data.now = formatOutput(crowded_now)
  }
  return data

}

const fetchHtml = async(url) => {
  try {
    const html = await fetch({
      url: url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.108 Safari/537.36',
      },
    })
    return html.data
  }
  catch (err) {
    return { status: 'error', message: 'Invalid url' }
  }
}

export default async placeUrl => {
  const html = await fetchHtml(placeUrl)
  const busyHours = processHtml(html)

  return busyHours
}
