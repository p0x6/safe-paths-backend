import Joi from '@hapi/joi'
import restifyErrors from 'restify-errors'
import { logger } from '../libs/index.js'

import { dump } from '../utils/index.js'

const { InvalidArgumentError, NotFoundError } = restifyErrors

export default async (req, res) => {
  try {
    const schema = Joi.object().keys({
      endpoint: Joi.string().required(),
    })

    const { error, value } = schema.validate(req.body)

    if (error) {
      const errMsg = error.details.map((detail) => detail.message).join('. ')

      throw new InvalidArgumentError(errMsg)
    }

    // const subscription = await Subscription.findOne({ endpoint: value.endpoint })

    // if (!subscription) {
    //   throw new NotFoundError('Subscription not found')
    // }

    // await subscription.remove()

    return res.sendStatus(204)
  } catch(err) {
    logger.error(err)

    return res.status(err.statusCode || 502).send(dump.dumpError(err))
  }
}
