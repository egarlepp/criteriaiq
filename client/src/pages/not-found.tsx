import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import logoBackgroundLight from "@assets/system/branding/criteriaiq-logo-light.png";
import logoBackgroundDark from "@assets/system/branding/criteriaiq-logo-dark.png";
import { useBrandingSupportEmail } from "@/hooks/useBrandingAsset";

export default function NotFound() {
  const { theme } = useTheme();
  const { email: supportEmail } = useBrandingSupportEmail();
  const logoBackground = theme === "dark" ? logoBackgroundDark : logoBackgroundLight;
  return (
    <div className="min-h-screen w-full flex items-center justify-center relative bg-gray-50 dark:bg-gray-900">
      {/* Background logo with low opacity */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          backgroundImage: `url(${logoBackground})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center center',
          backgroundSize: 'contain',
          opacity: 0.08,
          width: '80%',
          height: '80%',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}
      />
      
      {/* Content with higher z-index */}
      <Card className="w-full max-w-md mx-4 relative z-10 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-lg">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">404 Page Not Found...</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            Seems the page you are looking for is not where you thought it was.
            {supportEmail
              ? ` Please reach out to ${supportEmail} with a screenshot and a short message about what you were trying to do, and we'll help. Thank you!`
              : " Please contact your administrator if you need help."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
