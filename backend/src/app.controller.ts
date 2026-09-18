import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  getHealth() {
    return this.appService.getHealth();
  }

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'API version information' })
  @ApiResponse({ status: 200, description: 'Version information' })
  getVersion() {
    return this.appService.getVersion();
  }

  /**
   * TEMPORARY diagnostic: measures how long DB round-trips take FROM INSIDE the
   * backend (server -> Supabase -> back), separate from the browser->Render leg.
   * This isolates network/DB latency from Render CPU/app time. Remove after use.
   * GET /diag/db-timing
   */
  @Public()
  @Get('diag/db-timing')
  getDbTiming() {
    return this.appService.getDbTiming();
  }
}
