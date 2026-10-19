import dataProvider from "@refinedev/simple-rest";
import { axiosInstance } from "./api";
import { API_URL } from "./constants";

// Stock simple-rest provider, no custom code (D5): the backend speaks its
// `_start/_end/_sort/_order`, `field_like`, `x-total-count` conventions.
// Passing our axios instance is how it gets the Bearer header + refresh.
export default dataProvider(API_URL, axiosInstance);
