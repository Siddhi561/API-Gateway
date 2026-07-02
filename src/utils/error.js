export class UnauthorizedError extends Error{
    constructor(message = 'Unauthorized'){
        super(message)
        this.name = 'UnauthorizedError'
        this.status = 401
    }
}


export class ForbiddenError extends Error{
    constructor(message = 'Forbidden'){
        super(message)
        this.name = 'ForbiddenError'
        this.status = 403
    }
}

export class NotFoundError extends Error{
    constructor(message = 'NotFound'){
        super(message)
        this.name = 'NotFoundError'
        this.status = 404
    }
}

export class CircuitOpenError extends Error {
  constructor() {
    super('Upstream service unavailable — circuit breaker is open')
    this.status = 503
    this.name = 'CircuitOpenError'
  }
}
