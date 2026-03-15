/**
 * Agent configuration — delegates to the shared per-app schema in
 * @hospital-cms/config so defaults and types stay in one place.
 */
export {
  getAgentConfigFromPackage as getAgentConfig,
  resetAgentConfig,
} from "@hospital-cms/config";
export type { AgentConfigFromPackage as AgentConfig } from "@hospital-cms/config";
