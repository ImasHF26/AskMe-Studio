import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'analyst@askme.ai', description: 'Adresse email de l’utilisateur' })
  @IsEmail({}, { message: 'Format d’email invalide' })
  @IsNotEmpty({ message: 'L’email est requis' })
  email!: string;

  @ApiProperty({ example: 'P@ssw0rdSecure123!', minLength: 8, description: 'Mot de passe sécurisé' })
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  password!: string;

  @ApiProperty({ example: 'Sami Analyst', description: 'Nom complet de l’utilisateur' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom complet est requis' })
  fullName!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'analyst@askme.ai', description: 'Adresse email de l’utilisateur' })
  @IsEmail({}, { message: 'Format d’email invalide' })
  @IsNotEmpty({ message: 'L’email est requis' })
  email!: string;

  @ApiProperty({ example: 'P@ssw0rdSecure123!', description: 'Mot de passe de l’utilisateur' })
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'Jeton de rafraîchissement (Refresh Token)' })
  @IsString({ message: 'Le refresh token doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le refresh token est requis' })
  refreshToken!: string;
}
