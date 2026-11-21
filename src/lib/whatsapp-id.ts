export const GROUP_ID_PATTERN = /^[0-9][0-9-]*@g\.us$/

export function isGroupId(value: string): boolean {
  return GROUP_ID_PATTERN.test(value)
}
