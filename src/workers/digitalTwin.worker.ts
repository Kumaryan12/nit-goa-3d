import { prepareDigitalTwin, twinTransferBuffers } from '../lib/prepareDigitalTwin.ts'
import type { TwinBuildRequest, TwinBuildReply } from '../lib/prepareDigitalTwin.ts'

const scope = self as unknown as { onmessage: (event: MessageEvent<TwinBuildRequest>) => void; postMessage: (message: TwinBuildReply, transfer?: ArrayBuffer[]) => void }
scope.onmessage = ({ data }) => {
  try {
    const twin = prepareDigitalTwin(data)
    scope.postMessage({ id: data.id, twin }, twinTransferBuffers(twin))
  } catch {
    scope.postMessage({ id: data.id, error: 'Campus generation failed.' })
  }
}
