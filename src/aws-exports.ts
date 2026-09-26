const required = (name: string): string => {
  const value = import.meta.env[name];
  if (!value) throw new Error(`Missing ${name}; copy .env.example to .env and fill it in.`);
  return value;
};

const region = import.meta.env.VITE_AWS_REGION || "us-east-2";

const awsmobile = {
  aws_project_region: region,
  aws_cognito_region: region,
  aws_user_pools_id: required("VITE_COGNITO_USER_POOL_ID"),
  aws_user_pools_web_client_id: required("VITE_COGNITO_CLIENT_ID"),
};

export default awsmobile;
