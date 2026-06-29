import { handleValidationJobsPost } from './route-handler';

export async function POST(request: Request) {
  return handleValidationJobsPost(request);
}
