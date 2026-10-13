/** fetch de la plataforma. En móvil no hay CORS: el fetch global sirve tal cual. */
export const appFetch: typeof fetch = (input, init) => fetch(input, init);
