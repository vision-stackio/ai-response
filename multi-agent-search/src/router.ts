import { IAgent } from './agents/baseAgent';
import { DocumentAgent } from './agents/DocumentAgent';
import { ImageAgent } from './agents/imageAgent';
import { VideoAgent } from './agents/videoAgent';

export function routeAgent(mimeType: string): IAgent {
  if (mimeType.startsWith('image/')) {
    return new ImageAgent();
  } else if (mimeType.startsWith('video/')) {
    return new VideoAgent();
  } else {
    return new DocumentAgent();
  }
}
