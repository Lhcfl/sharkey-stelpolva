export class RequestCanceledError extends Error {
	// Fix the error name in stack traces - https://stackoverflow.com/a/71573071
	override name = this.constructor.name;

	public isCancel: boolean

  constructor(msg: string) {
    super(msg)
    this.isCancel = true
    Object.setPrototypeOf(this, RequestCanceledError)
  }
}

export const isCancel = (value: any): boolean => {
  return value && value.isCancel
}
