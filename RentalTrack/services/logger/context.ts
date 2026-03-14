let globalContext: { request_id?: string; tenant_id?: number } = {};

export const setLogContext = (ctx: { request_id?: string; tenant_id?: number }) => {
  globalContext = { ...globalContext, ...ctx };
};

export const clearLogContext = () => {
  globalContext = {};
};

export const getLogContext = () => globalContext;

