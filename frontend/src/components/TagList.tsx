import { Tag } from "antd";
import type { Tag as TagRecord } from "../types";

// Ticket tags in their own colours (the record already embeds them).
export const TagList = ({ tags }: { tags: TagRecord[] }) => (
  <>
    {tags.map((tag) => (
      <Tag key={tag.id} color={tag.color}>
        {tag.name}
      </Tag>
    ))}
  </>
);
