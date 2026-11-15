const { firstLink, fetchPreview } = require('../helpers/linkPreview')

// preview shown above the composer while typing a link (requires requireAuth)
const linkPreview = async (req, res) => {
    try {
        const url = firstLink(req.body?.url)
        if (!url) return res.json({ success : true, data : null })
        const data = await fetchPreview(url)
        return res.json({ success : true, data })
    } catch (error) {
        return res.json({ success : true, data : null })
    }
}

module.exports = { linkPreview }
