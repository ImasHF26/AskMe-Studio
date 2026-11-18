import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto, RegisterDto } from './dto/auth.dto';

@ApiTags('Authentification & Profil')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/api/v1/auth/register')
  @ApiOperation({ summary: 'Créer un nouveau compte utilisateur' })
  @ApiResponse({ status: 201, description: 'Compte créé avec succès, tokens JWT d’accès et de rafraîchissement générés' })
  @ApiResponse({ status: 400, description: 'Données invalides ou mot de passe trop court' })
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.fullName);
  }

  @Post('/api/v1/auth/login')
  @ApiOperation({ summary: 'Connexion utilisateur et émission des jetons d’accès et rafraîchissement' })
  @ApiResponse({ status: 200, description: 'Authentification réussie' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides' })
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Post('/api/v1/auth/refresh')
  @ApiOperation({ summary: 'Renouvellement du jeton d’accès via Refresh Token' })
  @ApiResponse({ status: 200, description: 'Nouveaux jetons émis avec succès' })
  @ApiResponse({ status: 401, description: 'Refresh token invalide, manquant ou expiré' })
  refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @Get('/api/v1/auth/me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Récupérer le profil de l’utilisateur authentifié' })
  @ApiResponse({ status: 200, description: 'Profil utilisateur courant' })
  @ApiResponse({ status: 401, description: 'Jeton JWT manquant, invalide ou expiré' })
  async me(@Headers('authorization') authorization?: string) {
    const token = this.extractBearer(authorization);
    return this.authService.getCurrentUser(token);
  }

  private extractBearer(authorization?: string): string {
    if (!authorization) return '';
    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') return '';
    return token || '';
  }
}
