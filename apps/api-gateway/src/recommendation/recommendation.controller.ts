import { isRpcError } from '@common/constants/rpc-error.types';
import { RecommendationTelemetrySummaryQueryDto } from '@common/recommendation/dtos/recommendation-telemetry-summary-query.dto';
import type { RecommendationTelemetrySummary } from '@common/recommendation/interfaces/recommendation-telemetry-summary.interface';
import { Role, Roles } from '@gateway/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@gateway/auth/guards/roles.guard';
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { catchError, lastValueFrom } from 'rxjs';

@ApiTags('Recommendations')
@Controller('recommendations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RecommendationController {
  constructor(
    @Inject('MONITORING_SERVICE')
    private readonly monitoringClient: ClientProxy,
  ) {}

  @Get('telemetry/summary')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get recommendation telemetry summary',
  })
  async getTelemetrySummary(
    @Query()
    query: RecommendationTelemetrySummaryQueryDto,
  ): Promise<RecommendationTelemetrySummary> {
    return await lastValueFrom(
      this.monitoringClient
        .send<RecommendationTelemetrySummary>(
          'recommendation.telemetry.summary',
          query,
        )
        .pipe(catchError((error) => this.handleMicroserviceError(error))),
    );
  }

  private handleMicroserviceError(error: unknown): never {
    if (isRpcError(error)) {
      throw new HttpException(error.message, error.statusCode);
    }

    throw new HttpException(
      'Internal Server Error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
