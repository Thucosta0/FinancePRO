// Função simples para testar a configuração do Netlify Functions
exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Olá do Netlify Functions!',
      path: event.path,
      httpMethod: event.httpMethod,
      timestamp: new Date().toISOString()
    })
  };
}; 