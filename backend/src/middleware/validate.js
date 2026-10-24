/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.parse(req[source]);
    req[source] = parsed;
    next();
  };
}
