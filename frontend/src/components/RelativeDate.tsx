import { Tooltip } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime); // adds .fromNow(); dayjs is already an antd/Refine dependency

// "3 hours ago", with the exact timestamp on hover.
export const RelativeDate = ({ value }: { value: string }) => (
  <Tooltip title={dayjs(value).format("YYYY-MM-DD HH:mm")}>{dayjs(value).fromNow()}</Tooltip>
);
