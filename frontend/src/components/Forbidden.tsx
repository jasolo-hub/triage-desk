import { Button, Result } from "antd";
import { Link } from "react-router";

// Shown when the current route's resource/action is not in the user's
// permissions (e.g. AGENT typing /users or /tickets/create by hand).
export const Forbidden = () => (
  <Result
    status="403"
    title="Not allowed"
    subTitle="Your role does not have access to this page."
    extra={
      <Link to="/">
        <Button type="primary">Back to tickets</Button>
      </Link>
    }
  />
);
