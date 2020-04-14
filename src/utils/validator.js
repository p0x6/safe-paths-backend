import Joi from '@hapi/joi'
import restifyErrors from 'restify-errors'

const { InvalidArgumentError } = restifyErrors

export const validate = (data, schema) => {
  const { error, value } = schema.validate(data)

  if (error) {
    const errMsg = error.details.map((detail) => detail.message).join('. ')

    throw new InvalidArgumentError(errMsg)
  }

  return value
}

export const schema = Joi
