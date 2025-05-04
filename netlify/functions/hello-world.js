// Função simples para testar a implantação no Netlify
module.exports = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: "Olá do Netlify Functions!",
      success: true,
      timestamp: new Date().toISOString()
    })
  };
}; 