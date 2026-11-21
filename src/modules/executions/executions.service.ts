import { NotFoundError } from '../../errors/http-error.js'
import type { ExecutionsRepository } from './executions.repository.js'
import type { Execution, ExecutionFilters } from './executions.types.js'

export function createExecutionsService(executions: ExecutionsRepository) {
  return {
    list(filters: ExecutionFilters): { data: Execution[]; total: number } {
      return {
        data: executions.list(filters),
        total: executions.count(filters),
      }
    },

    get(id: string): Execution {
      const execution = executions.findById(id)

      if (!execution) {
        throw new NotFoundError(`Execution ${id} not found`)
      }

      return execution
    },
  }
}

export type ExecutionsService = ReturnType<typeof createExecutionsService>
