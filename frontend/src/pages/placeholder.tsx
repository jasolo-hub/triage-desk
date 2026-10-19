import { useResourceParams } from "@refinedev/core";

// Temporary stand-in for every resource route until the inferencer-based
// pages land (F5+). Shows which resource/action the router resolved.
export const Placeholder = () => {
  const { resource, action, id } = useResourceParams();
  return (
    <div>
      {resource?.name} / {action}
      {id !== undefined ? ` #${id}` : ""}
    </div>
  );
};
