const sendSuccess = (res, payload) => {
  res.status(200).send({
    status: "SUCCESS",
    code: 200,
    message: payload.message || "Resource found.",
    ...payload,
  });
};

const sendCreated = (res, payload) => {
  res.status(201).send({
    status: "SUCCESS",
    code: 201,
    message: payload.message || "Data created.",
    ...payload,
  });
};

const sendBadRequest = (res, message) => {
  res.status(400).send({
    status: "ERROR",
    code: 400,
    message: message || "Bad Request.",
  });
};

const sendNotFound = (res, message) => {
  res.status(404).send({
    status: "ERROR",
    code: 404,
    message: message || "Resource not found.",
  });
};

const sendConflict = (res, message) => {
  res.status(409).send({
    status: "CONFLICT",
    code: 409,
    message: message || "There is a conflict.",
  });
};

const sendInvalid = (res, message) => {
  res.status(422).send({
    status: "ERROR",
    code: 422,
    message: message || "Invalid attributes.",
  });
};

const sendUnauthorized = (res, message) => {
  res.status(401).json({
    status: "ERROR",
    code: 401,
    message: message || "You are not authorized.",
  });
};

const sendForbidden = (res, message) => {
  res.status(403).json({
    status: "ERROR",
    code: 403,
    message: message || "You don't have access to request this site.",
  });
};

const sendInternalError = (res, errors) => {
  res.status(500).send({
    status: "ERROR",
    code: 500,
    message: "Something Error.",
    errors,
  });
};

const sendError = (res, code, payload) => {
  res.status(code).json({
    status: payload?.status || "ERROR",
    code,
    message: payload.message || "Something failed.",
    data: payload?.data,
  });
};

export default {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  sendNotFound,
  sendConflict,
  sendInvalid,
  sendUnauthorized,
  sendForbidden,
  sendInternalError,
  sendError,
};
