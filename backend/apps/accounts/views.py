from django.conf import settings
from rest_framework import status 
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import MiseTokenObtainPairSerializer, UserSerializer

COOKIE_NAME = settings.REFRESH_TOKEN_COOKIE_NAME
COOKIE_KWARGS = dict(
    httponly=True,
    samesite="Lax",
    secure=not settings.DEBUG,
    path="/api/auth/",
)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = MiseTokenObtainPairSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tokens = serializer.validated_data
        user = serializer.user

        response = Response(
            {
                "access": str(tokens["access"]),
                "user": UserSerializer(user).data,
            }
        )
        response.set_cookie(COOKIE_NAME, str(tokens["refresh"]), **COOKIE_KWARGS)
        return response


class RefreshView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        raw_refresh = request.COOKIES.get(COOKIE_NAME)
        if not raw_refresh:
            return Response({"detail": "No refresh token cookie."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            old_refresh = RefreshToken(raw_refresh)
            access = old_refresh.access_token
            user = User.objects.get(id=old_refresh["user_id"])
        except (TokenError, User.DoesNotExist):
            return Response({"detail": "Refresh token invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response({"access": str(access)})

        if settings.SIMPLE_JWT.get("ROTATE_REFRESH_TOKENS"):
            try:
                old_refresh.blacklist()
            except AttributeError:
                pass
            new_refresh = RefreshToken.for_user(user)
            response.set_cookie(COOKIE_NAME, str(new_refresh), **COOKIE_KWARGS)

        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_refresh = request.COOKIES.get(COOKIE_NAME)
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(COOKIE_NAME, path="/api/auth/")
        return response


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)
