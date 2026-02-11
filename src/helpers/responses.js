const sendSuccess = (res, payload) => {
  res.status(200).send({
    status: "SUCCESS",
    code: 200,
    message: payload.message || "Data berhasil ditemukan.",
    ...payload,
  });
};

const sendCreated = (res, payload) => {
  res.status(201).send({
    status: "SUCCESS",
    code: 201,
    message: payload.message || "Data berhasil dibuat.",
    ...payload,
  });
};

const sendBadRequest = (res, message) => {
  res.status(400).send({
    status: "ERROR",
    code: 400,
    message: message || "Permintaan tidak valid.",
  });
};

const sendNotFound = (res, message) => {
  res.status(404).send({
    status: "ERROR",
    code: 404,
    message: message || "Data tidak ditemukan.",
  });
};

const sendConflict = (res, message) => {
  res.status(409).send({
    status: "CONFLICT",
    code: 409,
    message: message || "Terjadi konflik data.",
  });
};

const sendInvalid = (res, message) => {
  res.status(422).send({
    status: "ERROR",
    code: 422,
    message: message || "Data tidak valid.",
  });
};

const sendUnauthorized = (res, message) => {
  res.status(401).json({
    status: "ERROR",
    code: 401,
    message: message || "Anda tidak memiliki otorisasi.",
  });
};

const sendForbidden = (res, message) => {
  res.status(403).json({
    status: "ERROR",
    code: 403,
    message: message || "Anda tidak memiliki akses ke halaman ini.",
  });
};

const sendInternalError = (res, errors) => {
  res.status(500).send({
    status: "ERROR",
    code: 500,
    message: "Terjadi kesalahan.",
    errors,
  });
};

const sendError = (res, code, payload) => {
  res.status(code).json({
    status: payload?.status || "ERROR",
    code,
    message: payload.message || "Terjadi kegagalan.",
    data: payload?.data,
  });
};

const sendServerError = (res, message) => {
  res.status(500).send({
    status: "ERROR",
    code: 500,
    message: message || "Kesalahan server internal.",
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
  sendServerError,
};
